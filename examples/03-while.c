#include <stdio.h>

void countdown() {
    int n = 5;
    while (n > 0) {
        printf("%d... ", n);
        n--;
    }
    puts("Lift off!");
}

int main() {
    countdown();
}
