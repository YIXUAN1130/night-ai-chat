/*
 * CSE3027 Computer Networks - Project 1
 * Concurrent Web Server using BSD Sockets
 *
 * Compile: make
 * Run:     ./myserver <port number>
 * Example: ./myserver 9000
 * Test:    http://localhost:9000/index.html
 */

#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <netinet/in.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#define BACKLOG 10
#define BUF_SIZE 8192
#define SMALL_BUF 512

static void reap_child(int sig) {
    (void)sig;
    while (waitpid(-1, NULL, WNOHANG) > 0) {
        ;
    }
}

static void send_all(int sock, const void *buf, size_t len) {
    const char *p = (const char *)buf;
    while (len > 0) {
        ssize_t n = send(sock, p, len, 0);
        if (n <= 0) {
            if (errno == EINTR) continue;
            break;
        }
        p += n;
        len -= (size_t)n;
    }
}

static const char *content_type(const char *path) {
    const char *ext = strrchr(path, '.');
    if (ext == NULL) return "application/octet-stream";

    if (strcasecmp(ext, ".html") == 0 || strcasecmp(ext, ".htm") == 0)
        return "text/html";
    if (strcasecmp(ext, ".gif") == 0)
        return "image/gif";
    if (strcasecmp(ext, ".jpg") == 0 || strcasecmp(ext, ".jpeg") == 0)
        return "image/jpeg";
    if (strcasecmp(ext, ".mp3") == 0)
        return "audio/mpeg";
    if (strcasecmp(ext, ".pdf") == 0)
        return "application/pdf";

    return "application/octet-stream";
}

static void send_error(int client, int status, const char *title, const char *message) {
    char body[SMALL_BUF * 2];
    char header[SMALL_BUF * 2];

    snprintf(body, sizeof(body),
             "<html><head><title>%d %s</title></head>"
             "<body><h1>%d %s</h1><p>%s</p></body></html>",
             status, title, status, title, message);

    snprintf(header, sizeof(header),
             "HTTP/1.0 %d %s\r\n"
             "Server: CSE3027-Project1-WebServer\r\n"
             "Content-Type: text/html\r\n"
             "Content-Length: %zu\r\n"
             "Connection: close\r\n"
             "\r\n",
             status, title, strlen(body));

    send_all(client, header, strlen(header));
    send_all(client, body, strlen(body));
}

static int hex_value(char c) {
    if ('0' <= c && c <= '9') return c - '0';
    if ('a' <= c && c <= 'f') return c - 'a' + 10;
    if ('A' <= c && c <= 'F') return c - 'A' + 10;
    return -1;
}

static void url_decode(char *dst, const char *src, size_t dst_size) {
    size_t i = 0;
    while (*src != '\0' && i + 1 < dst_size) {
        if (*src == '%' && isxdigit((unsigned char)src[1]) && isxdigit((unsigned char)src[2])) {
            int high = hex_value(src[1]);
            int low = hex_value(src[2]);
            dst[i++] = (char)((high << 4) | low);
            src += 3;
        } else if (*src == '+') {
            dst[i++] = ' ';
            src++;
        } else {
            dst[i++] = *src++;
        }
    }
    dst[i] = '\0';
}

static int safe_path(const char *path) {
    if (strstr(path, "..") != NULL) return 0;
    if (path[0] == '/') return 0;
    return 1;
}

static void serve_file(int client, const char *filename) {
    FILE *fp = fopen(filename, "rb");
    if (fp == NULL) {
        send_error(client, 404, "Not Found", "The requested file was not found on this server.");
        return;
    }

    struct stat st;
    if (stat(filename, &st) < 0 || !S_ISREG(st.st_mode)) {
        fclose(fp);
        send_error(client, 403, "Forbidden", "The requested path is not a regular file.");
        return;
    }

    char header[SMALL_BUF * 2];
    snprintf(header, sizeof(header),
             "HTTP/1.0 200 OK\r\n"
             "Server: CSE3027-Project1-WebServer\r\n"
             "Content-Type: %s\r\n"
             "Content-Length: %ld\r\n"
             "Connection: close\r\n"
             "\r\n",
             content_type(filename), (long)st.st_size);

    send_all(client, header, strlen(header));

    char buf[BUF_SIZE];
    size_t n;
    while ((n = fread(buf, 1, sizeof(buf), fp)) > 0) {
        send_all(client, buf, n);
    }

    fclose(fp);
}

static void handle_client(int client) {
    char request[BUF_SIZE + 1];
    ssize_t received = recv(client, request, BUF_SIZE, 0);
    if (received <= 0) {
        close(client);
        return;
    }
    request[received] = '\0';

    /* Part A: dump the HTTP request message to the server console. */
    printf("\n========== HTTP Request Start ==========" "\n");
    printf("%s", request);
    printf("\n=========== HTTP Request End ===========" "\n");
    fflush(stdout);

    char method[SMALL_BUF];
    char uri[SMALL_BUF];
    char version[SMALL_BUF];

    if (sscanf(request, "%511s %511s %511s", method, uri, version) != 3) {
        send_error(client, 400, "Bad Request", "The server could not parse the request line.");
        close(client);
        return;
    }

    if (strcmp(method, "GET") != 0) {
        send_error(client, 501, "Not Implemented", "This simple server only implements the GET method.");
        close(client);
        return;
    }

    /* Remove query string, such as /index.html?x=1 */
    char *question = strchr(uri, '?');
    if (question != NULL) *question = '\0';

    char decoded[SMALL_BUF];
    url_decode(decoded, uri, sizeof(decoded));

    char filename[SMALL_BUF];
    if (strcmp(decoded, "/") == 0) {
        snprintf(filename, sizeof(filename), "index.html");
    } else if (decoded[0] == '/') {
        snprintf(filename, sizeof(filename), "%s", decoded + 1);
    } else {
        snprintf(filename, sizeof(filename), "%s", decoded);
    }

    if (!safe_path(filename)) {
        send_error(client, 403, "Forbidden", "Directory traversal is not allowed.");
        close(client);
        return;
    }

    /* Part B: send HTTP response headers and the requested file body. */
    serve_file(client, filename);
    close(client);
}

int main(int argc, char *argv[]) {
    if (argc != 2) {
        fprintf(stderr, "Usage: %s <port number>\n", argv[0]);
        exit(EXIT_FAILURE);
    }

    int port = atoi(argv[1]);
    if (port <= 1024 || port > 65535) {
        fprintf(stderr, "Please use a port number between 1025 and 65535.\n");
        exit(EXIT_FAILURE);
    }

    signal(SIGCHLD, reap_child);

    int listenfd = socket(AF_INET, SOCK_STREAM, 0);
    if (listenfd < 0) {
        perror("socket");
        exit(EXIT_FAILURE);
    }

    int opt = 1;
    if (setsockopt(listenfd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        perror("setsockopt");
        close(listenfd);
        exit(EXIT_FAILURE);
    }

    struct sockaddr_in server_addr;
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = htonl(INADDR_ANY);
    server_addr.sin_port = htons((uint16_t)port);

    if (bind(listenfd, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
        perror("bind");
        close(listenfd);
        exit(EXIT_FAILURE);
    }

    if (listen(listenfd, BACKLOG) < 0) {
        perror("listen");
        close(listenfd);
        exit(EXIT_FAILURE);
    }

    printf("Web server is running on port %d\n", port);
    printf("Open: http://localhost:%d/index.html\n", port);

    while (1) {
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        int client = accept(listenfd, (struct sockaddr *)&client_addr, &client_len);
        if (client < 0) {
            if (errno == EINTR) continue;
            perror("accept");
            continue;
        }

        pid_t pid = fork();
        if (pid < 0) {
            perror("fork");
            close(client);
            continue;
        }

        if (pid == 0) {
            close(listenfd);
            handle_client(client);
            exit(EXIT_SUCCESS);
        } else {
            close(client);
        }
    }

    close(listenfd);
    return 0;
}
