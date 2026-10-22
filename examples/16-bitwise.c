#include <stdio.h>

int popcount(int x) {
    int count = 0;
    while (x) {
        count += x & 1;
        x >>= 1;
    }
    return count;
}

int main() {
    int a = 0x5A, b = 0x0F;
    printf("a & b = %d, a | b = %d, a ^ b = %d\n", a & b, a | b, a ^ b);
    printf("~a = %d, a << 3 = %d, -20 >> 2 = %d\n", ~a, a << 3, -20 >> 2);
    printf("a in binary: ");
    for (int i = 7; i >= 0; i--) {
        printf("%d", (a >> i) & 1);
    }
    printf("\nBits set in 255: %d\n", popcount(255));
}
