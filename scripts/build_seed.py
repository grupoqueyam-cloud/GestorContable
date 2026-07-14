#!/usr/bin/env python3
"""Normaliza los dos libros fuente y crea la base inicial cifrada.

Este script no copia los Excel al proyecto. Requiere pandas y cryptography.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import sys
import unicodedata
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def clean(value: Any) -> Any:
    if value is None or (not isinstance(value, (list, dict)) and pd.isna(value)):
        return ""
    return value


def text(value: Any) -> str:
    value = clean(value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def normalized(value: Any) -> str:
    raw = unicodedata.normalize("NFD", text(value))
    return re.sub(r"\s+", " ", "".join(c for c in raw if unicodedata.category(c) != "Mn")).strip()


def head(value: Any) -> str:
    return normalized(value).upper()


def as_number(value: Any) -> float:
    value = clean(value)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    source = str(value).strip()
    tokens = re.findall(r"-?\(?\d[\d.,]*\)?", source)
    raw = (tokens[-1] if "IVA" in source.upper() and len(tokens) > 1 else tokens[0]) if tokens else ""
    if not raw:
        return 0.0
    negative = raw.startswith("(") and raw.endswith(")")
    raw = raw.strip("()")
    if raw.rfind(",") > raw.rfind("."):
        raw = raw.replace(".", "").replace(",", ".")
    else:
        raw = raw.replace(",", "")
    try:
        result = float(raw)
        return -abs(result) if negative else result
    except ValueError:
        return 0.0


def as_date(value: Any) -> str:
    value = clean(value)
    if not value:
        return ""
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, (int, float)) and 20000 < value < 100000:
        return (datetime(1899, 12, 30) + timedelta(days=int(value))).strftime("%Y-%m-%d")
    raw = text(value)
    for dayfirst in (True, False):
        try:
            parsed = pd.to_datetime(raw, dayfirst=dayfirst, errors="raise")
            return parsed.strftime("%Y-%m-%d")
        except Exception:
            pass
    return ""


def status_progress(status: str) -> int:
    value = head(status)
    rules = [
        (r"PUBLICAD|FINALIZAD|CERRAD", 100),
        (r"ACEPTAD", 90),
        (r"TERMINAD|ENTREGAD", 82),
        (r"CORRECCION|PARES|REVISION", 68),
        (r"ENVIAD|SUBID|REVISTA", 55),
        (r"ELABOR|DESARROLL|PROCESO", 38),
        (r"RECHAZAD", 25),
        (r"PAUSAD|PENDIENTE|ESPERA", 15),
    ]
    for pattern, value_progress in rules:
        if re.search(pattern, value):
            return value_progress
    return 30 if value else 0


def blank_record() -> dict[str, Any]:
    timestamp = now()
    return {
        "id": str(uuid.uuid4()), "client": "", "topic": "", "product": "",
        "indexation": "", "status": "Pendiente", "progress": 0,
        "username": "", "password": "", "journal": "", "journalLink": "",
        "loginLink": "", "apcValue": 0, "investigator": "",
        "previousInvestigator": "", "startDate": "", "endDate": "",
        "acceptanceDate": "", "clientTotal": 0, "outstandingBalance": 0, "clientPayments": [],
        "nextPaymentDate": "", "nextPaymentAmount": 0,
        "investigatorPayment": 0, "investigatorPaid": 0,
        "contractNumber": "", "productionOrder": "", "clientEmail": "",
        "clientId": "", "observations": "", "sources": [],
        "createdAt": timestamp, "updatedAt": timestamp,
    }


def canonical_key(record: dict[str, Any]) -> str:
    contract = head(record.get("contractNumber"))
    if contract and contract not in {"NO", "N/A", "SIN", "0", "-"}:
        return f"C:{contract}"
    return f"T:{head(record.get('client'))}|{head(record.get('topic'))}"


def merge_records(current: list[dict[str, Any]], incoming: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = {canonical_key(record): record for record in current}
    text_fields = [
        "client", "topic", "product", "indexation", "status", "username",
        "password", "journal", "journalLink", "loginLink", "investigator",
        "previousInvestigator", "startDate", "endDate", "acceptanceDate",
        "nextPaymentDate", "contractNumber", "productionOrder", "clientEmail", "clientId",
    ]
    number_fields = [
        "progress", "apcValue", "clientTotal", "outstandingBalance", "nextPaymentAmount",
        "investigatorPayment", "investigatorPaid",
    ]
    for record in incoming:
        key = canonical_key(record)
        previous = records.get(key)
        if not previous:
            records[key] = record
            continue
        result = dict(previous)
        for field in text_fields:
            if text(record.get(field)):
                result[field] = record[field]
        for field in number_fields:
            result[field] = max(float(previous.get(field) or 0), float(record.get(field) or 0))
        payment_keys: set[str] = set()
        payments = []
        for payment in [*previous["clientPayments"], *record["clientPayments"]]:
            payment_key = f"{normalized(payment['concept'])}|{payment['amount']}|{payment['scheduledDate']}|{payment['paidDate']}"
            if payment_key not in payment_keys:
                payment_keys.add(payment_key)
                payments.append(payment)
        result["clientPayments"] = payments
        result["observations"] = " · ".join(dict.fromkeys(filter(None, [previous["observations"], record["observations"]])))
        result["sources"] = list(dict.fromkeys([*previous["sources"], *record["sources"]]))
        result["updatedAt"] = now()
        records[key] = result
    return list(records.values())


def rows_map(matrix: list[list[Any]], start: int, end: int) -> dict[str, list[Any]]:
    return {head(matrix[index][0]): matrix[index] for index in range(start, min(end + 1, len(matrix))) if matrix[index] and head(matrix[index][0])}


def find_row(rows: dict[str, list[Any]], patterns: list[str]) -> list[Any]:
    for label, row in rows.items():
        if any(re.search(pattern, label) for pattern in patterns):
            return row
    return []


def cell(row: list[Any], column: int) -> Any:
    return clean(row[column]) if column < len(row) else ""


def parse_production(matrix: list[list[Any]], sheet_name: str, file_name: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    client_rows = [index for index, row in enumerate(matrix) if row and head(row[0]) == "CLIENTE"]
    for block, client_index in enumerate(client_rows):
        previous = client_rows[block - 1] if block else -1
        start = client_index
        for index in range(client_index, max(previous, client_index - 8), -1):
            if head(matrix[index][0]) == "CONTRATO":
                start = index
                break
        next_client = client_rows[block + 1] if block + 1 < len(client_rows) else len(matrix)
        rows = rows_map(matrix, start, min(next_client - 1, client_index + 18))
        clients = matrix[client_index]
        contracts = find_row(rows, [r"^CONTRATO$"])
        orders = find_row(rows, [r"ORDEN DE PRODUCCION"])
        products = find_row(rows, [r"^PRODUCTO$"])
        starts = find_row(rows, [r"^INICIO", r"FECHA CONTRATO CLIENTE"])
        ends = find_row(rows, [r"^FIN", r"FECH FINAL"])
        totals = find_row(rows, [r"FACTURA TOTAL.*CLIENTE"])
        balances = find_row(rows, [r"SALDO CLIENTE"])
        statuses = find_row(rows, [r"ESTADO DE PRODUCTO", r"PROCESO DE SERVICIO", r"PROCESO DE PRODUCTO", r"^PUBLICADO$", r"^TERMINADO$"])
        payments = [
            find_row(rows, [r"^1\s*(RE|ER)?\s*PAGO$"]),
            find_row(rows, [r"^2\s*(DO)?\s*PAGO$"]),
            find_row(rows, [r"^3\s*(ER)?\s*PAGO$"]),
        ]
        invoices = find_row(rows, [r"FACTURA.*INVESTIGADOR", r"^FACTURA$"])
        for column in range(1, len(clients)):
            client_name = text(cell(clients, column))
            if not client_name or head(client_name) in {"CLIENTE", "TOTAL", "DATOS"}:
                continue
            record = blank_record()
            record["client"] = client_name
            record["contractNumber"] = text(cell(contracts, column))
            record["productionOrder"] = text(cell(orders, column))
            record["product"] = text(cell(products, column))
            record["topic"] = record["product"]
            record["startDate"] = as_date(cell(starts, column))
            record["endDate"] = as_date(cell(ends, column))
            record["clientTotal"] = as_number(cell(totals, column))
            record["status"] = text(cell(statuses, column)) or "Pendiente"
            record["progress"] = status_progress(record["status"])
            record["investigator"] = sheet_name.strip()
            record["investigatorPayment"] = sum(as_number(cell(row, column)) for row in payments)
            record["investigatorPaid"] = as_number(cell(invoices, column))
            balance = as_number(cell(balances, column))
            if balance > 0:
                record["outstandingBalance"] = balance
                record["nextPaymentAmount"] = balance
                record["nextPaymentDate"] = record["endDate"]
                record["observations"] = f"Saldo registrado en matriz de producción: {balance:g}"
            record["sources"] = [f"{file_name} · {sheet_name}"]
            records.append(record)
    return records


ALIASES = {
    "client": [r"^CLIENTE$", r"^NOMBRE CLIENTE$"],
    "topic": [r"^TEMA$", r"NOMBRE ARTICULO"],
    "product": [r"^PRODUCTO$"], "journal": [r"^REVISTAS?$"],
    "username": [r"^USUARIO$", r"^USUARO$", r"^USUARIO 2$"],
    "password": [r"CONTRASENA"], "indexation": [r"INDEXACION"],
    "status": [r"^ESTADO$", r"ESTADO DE ENVIO"],
    "startDate": [r"FECHA DE INICIO"], "endDate": [r"FECHA DE FIN"],
    "acceptanceDate": [r"FECHA ACEPTACION"],
    "journalLink": [r"^LINK REVISTA$", r"^LINK$"],
    "loginLink": [r"LINK LOGGIN", r"LINK LOGIN"],
    "contractNumber": [r"CONTRATO"], "productionOrder": [r"ORDEN DE PRODUCCION"],
    "observations": [r"OBSERVACION"], "email": [r"^CORREO$"],
    "clientId": [r"^C\.C$", r"^CEDULA$"],
    "previousInvestigator": [r"INVESTIGADOR ANTERIOR", r"PROCESO ANTERIOR DE"],
    "investigator": [r"INVESTIGADOR A CARGO", r"NUEVO INVESTIGADOR"],
    "payment1": [r"^1(RE|ER|RO)?\s*PAGO$"], "payment2": [r"^2(DO)?\s*PAGO$"],
}


def find_column(headers: list[str], patterns: list[str]) -> int:
    return next((index for index, value in enumerate(headers) if any(re.search(pattern, value) for pattern in patterns)), -1)


def payment_from(value: Any, concept: str) -> dict[str, Any] | None:
    raw = text(value)
    if not raw:
        return None
    amount = as_number(value)
    paid = amount > 0 or bool(re.search(r"PAGAD|CANCELAD|REALIZAD|SI|OK", head(raw)))
    return {
        "id": str(uuid.uuid4()), "concept": concept, "scheduledDate": "",
        "paidDate": "", "amount": amount, "status": "pagado" if paid else "pendiente",
        "note": "Importado desde Excel" if amount > 0 else raw,
    }


def parse_control(matrix: list[list[Any]], sheet_name: str, file_name: str) -> list[dict[str, Any]]:
    header_index = -1
    headers: list[str] = []
    for index, row in enumerate(matrix[:15]):
        candidate = [head(value) for value in row]
        score = sum(find_column(candidate, patterns) >= 0 for patterns in ALIASES.values())
        if score >= 3 and find_column(candidate, ALIASES["client"]) >= 0:
            header_index, headers = index, candidate
            break
    if header_index < 0:
        return []
    columns = {name: find_column(headers, patterns) for name, patterns in ALIASES.items()}

    def get(row: list[Any], name: str) -> Any:
        return cell(row, columns[name]) if columns[name] >= 0 else ""

    records: list[dict[str, Any]] = []
    empty_rows = 0
    for row in matrix[header_index + 1:]:
        if not any(text(value) for value in row):
            empty_rows += 1
            if empty_rows >= 5:
                break
            continue
        empty_rows = 0
        client_name = text(get(row, "client"))
        if not client_name or head(client_name) in {"CLIENTE", "TOTAL"}:
            continue
        record = blank_record()
        record["client"] = client_name
        record["topic"] = text(get(row, "topic"))
        record["product"] = text(get(row, "product"))
        record["journal"] = text(get(row, "journal"))
        record["username"] = text(get(row, "username"))
        record["password"] = text(get(row, "password"))
        record["indexation"] = text(get(row, "indexation"))
        record["status"] = text(get(row, "status")) or "Pendiente"
        record["progress"] = status_progress(record["status"])
        record["startDate"] = as_date(get(row, "startDate"))
        record["endDate"] = as_date(get(row, "endDate"))
        record["acceptanceDate"] = as_date(get(row, "acceptanceDate"))
        record["journalLink"] = text(get(row, "journalLink"))
        record["loginLink"] = text(get(row, "loginLink"))
        record["contractNumber"] = text(get(row, "contractNumber"))
        record["productionOrder"] = text(get(row, "productionOrder"))
        record["observations"] = text(get(row, "observations"))
        record["clientEmail"] = text(get(row, "email"))
        record["clientId"] = text(get(row, "clientId"))
        record["previousInvestigator"] = text(get(row, "previousInvestigator"))
        record["investigator"] = text(get(row, "investigator")) or sheet_name.strip()
        record["clientPayments"] = list(filter(None, [
            payment_from(get(row, "payment1"), "Primer pago"),
            payment_from(get(row, "payment2"), "Segundo pago"),
        ]))
        record["sources"] = [f"{file_name} · {sheet_name}"]
        records.append(record)
    return records


def parse_workbook(file_path: str) -> list[dict[str, Any]]:
    workbook = pd.ExcelFile(file_path)
    records: list[dict[str, Any]] = []
    for sheet_name in workbook.sheet_names:
        frame = pd.read_excel(file_path, sheet_name=sheet_name, header=None, dtype=object)
        frame = frame.dropna(how="all").dropna(axis=1, how="all")
        matrix = frame.where(pd.notna(frame), "").values.tolist()
        transposed = any(row and head(row[0]) == "CONTRATO" and sum(bool(text(value)) for value in row[1:]) > 1 for row in matrix)
        parsed = parse_production(matrix, sheet_name, Path(file_path).name) if transposed else parse_control(matrix, sheet_name, Path(file_path).name)
        records = merge_records(records, parsed)
    return records


def main() -> None:
    if len(sys.argv) != 4 or not os.environ.get("SEED_PASSPHRASE"):
        raise SystemExit("Uso: SEED_PASSPHRASE=... python scripts/build_seed.py produccion.xlsx control.xlsx salida.json")
    production_path, control_path, output_path = sys.argv[1:]
    production = parse_workbook(production_path)
    control = parse_workbook(control_path)
    records = sorted(merge_records(production, control), key=lambda record: normalized(record["client"]))
    app_data = {
        "version": 2, "records": records,
        "auditLog": [{
            "id": str(uuid.uuid4()), "timestamp": now(), "action": "Conciliación inicial",
            "detail": f"Dos libros procesados; {len(production) + len(control)} registros de origen y {len(records)} procesos consolidados",
        }],
        "importedAt": now(),
    }
    salt = os.urandom(16)
    iv = os.urandom(12)
    iterations = 250_000
    key = hashlib.pbkdf2_hmac("sha256", os.environ["SEED_PASSPHRASE"].encode(), salt, iterations, dklen=32)
    encrypted = AESGCM(key).encrypt(iv, json.dumps(app_data, ensure_ascii=False, separators=(",", ":")).encode(), None)
    envelope = {
        "version": 1, "algorithm": "AES-GCM", "kdf": "PBKDF2-SHA256",
        "iterations": iterations, "salt": base64.b64encode(salt).decode(),
        "iv": base64.b64encode(iv).decode(), "data": base64.b64encode(encrypted).decode(),
        "recordCount": len(records), "generatedAt": now(),
    }
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(envelope, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({
        "productionRecords": len(production), "controlRecords": len(control),
        "consolidatedRecords": len(records), "output": str(output),
    }))


if __name__ == "__main__":
    main()
