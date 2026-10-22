#include <stdio.h>

void classify(int n) {
    if (n % 2 == 0) {
        printf("%d is even\n", n);
    } else {
        printf("%d is odd\n", n);
    }
}

int main() {
    classify(7);
    classify(8);
}
