FROM python:3.10-slim

# Hugging Face Spaces konteyneri uid 1000 ile çalıştırıyor. ChromaDB hem
# veritabanına hem de ONNX embedding modelinin indiği ~/.cache'e yazmak
# zorunda, o yüzden root olmayan bir kullanıcı ve yazılabilir bir HOME şart.
RUN useradd -m -u 1000 user

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=user:user . .

RUN mkdir -p /app/agent_memory_db && chown -R user:user /app

USER user
ENV HOME=/home/user

# ChromaDB'nin kalıcı klasörü. docker-compose bunu mount edilen klasörle
# değiştiriyor; Spaces'te konteynerin kendi diski yeterli.
ENV AGENT_DB_PATH=/app/agent_memory_db

# Spaces varsayılanı 7860. Yerelde docker-compose bunu 8000'e çeviriyor.
ENV PORT=7860
EXPOSE 7860

# ${PORT} genişlemesi için shell gerekiyor, ama `exec` olmadan uvicorn sh'ın
# çocuğu kalır ve SIGTERM ona ulaşmaz — Container Apps sıfıra inerken
# konteyner düzgün kapanmaz. `exec` sh'ın yerine uvicorn'u geçiriyor.
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
