#!/bin/sh
#/usr/local/bin/CuraEngine -v -c "$2" -o "$3" "$1"
echo "0 = $1"
echo "1 = $2"
echo "2 = $3"
cp "$2" "$3"
