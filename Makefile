# Makefile for soundcraft-ui24r-tools native audio engine

CC ?= gcc
CFLAGS ?= -O3 -fPIC -Wall -Wextra
LDFLAGS ?= -shared -lm

BUILD_DIR = build
export TMPDIR = $(CURDIR)/$(BUILD_DIR)
SRC_DIR = src/audio
TARGET = $(BUILD_DIR)/libaudio_mixer.so

.PHONY: all clean

all: $(TARGET)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(TARGET): $(SRC_DIR)/audio_mixer.c $(SRC_DIR)/audio_mixer.h | $(BUILD_DIR)
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $(SRC_DIR)/audio_mixer.c

clean:
	rm -rf $(BUILD_DIR)
