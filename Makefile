CC = gcc
CFLAGS = -Wall -Wextra -O2
TARGET = myserver
SRC = myserver.c

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) -o $(TARGET) $(SRC)

clean:
	rm -f $(TARGET)
