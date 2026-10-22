#include <stdio.h>

int squares[10];

int main() {
    for (int i = 0; i < 10; i++) {
        squares[i] = i * i;
    }
    printf("Squares:");
    for (int i = 0; i < 10; i++) {
        printf(" %d", squares[i]);
    }
    printf("\n");
}
