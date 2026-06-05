FROM nginx:alpine
ARG BUILD_DATE=unknown
COPY . /usr/share/nginx/html
EXPOSE 80
