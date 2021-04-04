#!/bin/sh
umask 0002
/usr/local/bin/CuraEngine -v -c "$2" -o "$3" "$1"
