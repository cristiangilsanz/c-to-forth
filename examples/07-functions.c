#include <stdio.h>

int max3(int a, int b, int c) {
    if (a >= b) {
        if (a >= c) {
            return a;
        }
        return c;
    }
    if (b >= c) {
        return b;
    }
    return c;
}

int main() {
    printf("Largest of 12, 11 and 10: %d\n", max3(12, 11, 10));
    printf("Largest of 3, 9 and 4: %d\n", max3(3, 9, 4));
}
