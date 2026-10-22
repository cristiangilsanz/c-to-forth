#include <stdio.h>

int main() {
    printf("Odd numbers up to 12:");
    for (int i = 0;; i++) {
        if (i > 12) break;
        if (i % 2 == 0) continue;
        printf(" %d", i);
    }
    printf("\n");

    int n = 27, steps = 0;
    do {
        n = n % 2 ? 3 * n + 1 : n / 2;
        steps++;
    } while (n != 1);
    printf("Collatz steps from 27: %d\n", steps);

    int found = -1, k = 1;
    while (1) {
        if (k * k > 500) {
            found = k;
            break;
        }
        k++;
    }
    printf("First square above 500: %d^2\n", found);
}
