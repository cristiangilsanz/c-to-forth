#include <stdio.h>

int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

int main() {
    for (int n = 1; n <= 10; n++) {
        printf("%d! = %d\n", n, factorial(n));
    }
}
