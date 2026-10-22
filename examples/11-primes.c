#include <stdio.h>

int composite[50];

int main() {
    for (int i = 2; i * i < 50; i++) {
        if (!composite[i]) {
            for (int j = i * i; j < 50; j += i) {
                composite[j] = 1;
            }
        }
    }
    printf("Primes below 50:");
    for (int i = 2; i < 50; i++) {
        if (!composite[i]) {
            printf(" %d", i);
        }
    }
    printf("\n");
}
