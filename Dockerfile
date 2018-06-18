FROM gcr.io/google_appengine/nodejs

RUN /usr/local/bin/install_node '>=0.12.7'
COPY . /app/

RUN yarn || \
  ((if [ -f yarn-error.log ]; then \
      cat yarn-error.log; \
    fi) && false)
CMD yarn start
