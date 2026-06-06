FROM nginx:alpine
ARG BUILD_DATE=unknown
ARG AIRTABLE_TOKEN
COPY nginx.conf.template /tmp/nginx.conf.template
RUN envsubst '${AIRTABLE_TOKEN}' < /tmp/nginx.conf.template > /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
EXPOSE 80
