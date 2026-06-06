FROM nginx:alpine
COPY nginx.conf.template /tmp/nginx.conf.template
ARG BUILD_DATE=unknown
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["/bin/sh", "-c", "envsubst '${AIRTABLE_TOKEN}' < /tmp/nginx.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
