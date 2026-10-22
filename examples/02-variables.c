#include <stdio.h>

int a, b = 7;
int c = 3;

int main() {
    a = b * c - 1;
    printf("b * c - 1 = %d\n", a);
    printf("Divided by 4: %d\n", a / 4);
    printf("Remainder: %d\n", a % 4);
    printf("Negative division: %d\n", -a / 4);
}
