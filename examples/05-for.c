#include <stdio.h>

int total;

int main() {
    for (int i = 1; i <= 10; i++) {
        total += i;
    }
    printf("Sum of 1 to 10: %d\n", total);
}
