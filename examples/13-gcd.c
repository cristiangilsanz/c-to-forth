#include <stdio.h>

int gcd(int a, int b) {
    while (b != 0) {
        int r = a % b;
        a = b;
        b = r;
    }
    return a;
}

int main() {
    printf("gcd(1071, 462) = %d\n", gcd(1071, 462));
    printf("gcd(270, 192) = %d\n", gcd(270, 192));
}
