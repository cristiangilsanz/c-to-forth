#include <stdio.h>

void describe(int day) {
    switch (day) {
        case 0:
        case 6:
            puts("weekend");
            break;
        case 5:
            printf("almost the weekend, ");
        case 1:
        case 2:
        case 3:
        case 4:
            puts("weekday");
            break;
        default:
            puts("not a day");
    }
}

int main() {
    for (int day = 0; day <= 7; day++) {
        printf("%d: ", day);
        describe(day);
    }
}
