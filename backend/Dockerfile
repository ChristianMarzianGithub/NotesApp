# syntax=docker/dockerfile:1
FROM maven:3.9.11-eclipse-temurin-25 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
# Optional build secrets support managed development proxies without baking in CA files.
RUN --mount=type=secret,id=proxy_ca --mount=type=secret,id=maven_settings \
    if [ -f /run/secrets/proxy_ca ]; then cp "$JAVA_HOME/lib/security/cacerts" /tmp/cacerts; keytool -importcert -noprompt -alias session-proxy -file /run/secrets/proxy_ca -keystore /tmp/cacerts -storepass changeit; export MAVEN_OPTS="-Djavax.net.ssl.trustStore=/tmp/cacerts"; fi; \
    if [ -f /run/secrets/maven_settings ]; then mvn -s /run/secrets/maven_settings -B -DskipTests package; else mvn -B -DskipTests package; fi; \
    result=$?; rm -f /tmp/cacerts; exit "$result"
FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /app/target/notesapp-0.1.0.jar app.jar
COPY --from=build /app/target/classes/dev/notesapp/HealthCheck.class /app/health/dev/notesapp/HealthCheck.class
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
