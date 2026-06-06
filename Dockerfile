FROM nginx:alpine
ARG BUILD_DATE=unknown
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY . /usr/share/nginx/html
EXPOSE 80
