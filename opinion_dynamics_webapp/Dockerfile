FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt

RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/

COPY frontend/ ./frontend/

EXPOSE 8000

CMD ["uvicorn", "backend.main_app:app", "--host", "0.0.0.0", "--port", "8000"] 