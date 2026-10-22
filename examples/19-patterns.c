#include <stdio.h>

int main() {
    for (int row = 1; row <= 4; row++) {
        for (int col = 0; col < row; col++) {
            putchar('*');
        }
        putchar('\n');
    }
    for (char c = 'a'; c <= 'e'; c++) {
        printf("%c", c - 32);
    }
    printf("\n[%5d][%3d]\n", 42, 7);
}
