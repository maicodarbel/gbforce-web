FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
ARG BUILD_DATE=unknown
COPY . /usr/share/nginx/html
EXPOSE 80
