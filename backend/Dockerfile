FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app/backend

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements/ requirements/
RUN pip install --no-cache-dir -r requirements/dev.txt

# Dev only (dev compose passes INSTALL_CLAUDE_CLI=1; prod never does): the
# Ask Contentor help bot's local provider (HELP_BOT_PROVIDER=cli) shells out
# to the Claude Code CLI on the developer's subscription. Auth comes from
# CLAUDE_CODE_OAUTH_TOKEN in .env (generate once with `claude setup-token`).
ARG INSTALL_CLAUDE_CLI=0
RUN if [ "$INSTALL_CLAUDE_CLI" = "1" ]; then \
    curl -fsSL https://claude.ai/install.sh | bash \
    && ln -s /root/.local/bin/claude /usr/local/bin/claude; \
    fi

COPY . .

RUN chmod +x scripts/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["scripts/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]
