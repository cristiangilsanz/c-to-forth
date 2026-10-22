#include <stdio.h>

int values[8];

void show() {
    for (int i = 0; i < 8; i++) {
        printf("%d ", values[i]);
    }
    printf("\n");
}

int main() {
    int seed = 7;
    for (int i = 0; i < 8; i++) {
        seed = (seed * 31 + 11) % 97;
        values[i] = seed;
    }
    show();
    int swapped = 1;
    while (swapped) {
        swapped = 0;
        for (int i = 0; i < 7; i++) {
            if (values[i] > values[i + 1]) {
                int held = values[i];
                values[i] = values[i + 1];
                values[i + 1] = held;
                swapped = 1;
            }
        }
    }
    show();
}
