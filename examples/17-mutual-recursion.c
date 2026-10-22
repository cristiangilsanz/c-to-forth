#include <stdio.h>

int is_odd(int n);

int is_even(int n) {
    if (n == 0) return 1;
    return is_odd(n - 1);
}

int is_odd(int n) {
    if (n == 0) return 0;
    return is_even(n - 1);
}

int main() {
    for (int n = 0; n < 5; n++) {
        if (is_even(n)) {
            printf("%d is even\n", n);
        } else {
            printf("%d is odd\n", n);
        }
    }
}
