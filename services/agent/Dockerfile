FROM mcr.microsoft.com/playwright/python:v1.56.0-noble
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt \
 && useradd -m -s /bin/bash agent && mkdir -p /workspace /data \
 && chown -R agent:agent /workspace /data
COPY . /app/services/agent
RUN mkdir -p /app/services && touch /app/services/__init__.py \
 && chown -R agent:agent /app/services
USER agent
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV HOME=/tmp
EXPOSE 8787
CMD ["uvicorn","services.agent.main:create_app","--factory","--host","0.0.0.0","--port","8787","--workers","1"]
