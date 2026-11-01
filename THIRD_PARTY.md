# Third-Party Open Source Software & Licenses

CIT Schedora uses the following open-source libraries and runtimes:

## 1. Python Scheduling Microservice (`solver-service/`)

| Package | Version | License | Purpose |
| :--- | :--- | :--- | :--- |
| **Google OR-Tools (`ortools`)** | `>=9.10.0` (`9.15.6755`) | Apache-2.0 | CP-SAT constraint programming solver for deterministic weekly academic timetabling and midsemester examination scheduling |
| **FastAPI (`fastapi`)** | `>=0.115.0` | MIT | Private internal HTTP microservice API framework |
| **Pydantic (`pydantic`)** | `>=2.9.0` | MIT | Request/response schema validation |
| **Uvicorn (`uvicorn`)** | `>=0.32.0` | BSD-3-Clause | ASGI server for the Python solver service |
| **HTTPX (`httpx`)** | `>=0.27.0` | BSD-3-Clause | HTTP client for testing |
| **Pytest (`pytest`)** | `>=8.3.0` | MIT | Automated test runner for constraint & validator parity suites |

## 2. Node.js + React Application

| Package | License | Purpose |
| :--- | :--- | :--- |
| **Google Gen AI SDK (`@google/genai`)** | Apache-2.0 | Shared AI Orchestrator client for Gemini 3.8 Flash model |
| **Express (`express`)** | MIT | Node.js HTTP server & REST API routing |
| **Firebase Admin SDK (`firebase-admin`)** | Apache-2.0 | Server-side Firebase Authentication & Cloud Firestore integration |
| **Firebase Web SDK (`firebase`)** | Apache-2.0 | Client-side Authentication & Firestore integration |
| **Zod (`zod`)** | MIT | Runtime schema validation |
| **React (`react`, `react-dom`, `react-router-dom`)** | MIT | Frontend user interface |
| **Lucide React (`lucide-react`)** | ISC | UI iconography |
| **Tailwind CSS (`tailwindcss`)** | MIT | Utility-first CSS styling |
