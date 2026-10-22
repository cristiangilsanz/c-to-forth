#include <stdio.h>

int data[] = {42, 7, 19, 3, 88, 21, 5, 64};

void swap(int a[], int i, int j) {
    int held = a[i];
    a[i] = a[j];
    a[j] = held;
}

void sort(int a[], int n) {
    for (int i = 1; i < n; i++) {
        int j = i;
        while (j > 0 && a[j - 1] > a[j]) {
            swap(a, j - 1, j);
            j--;
        }
    }
}

void show(int a[], int n) {
    for (int i = 0; i < n; i++) {
        if (i > 0) printf(", ");
        printf("%d", a[i]);
    }
    printf("\n");
}

int main() {
    show(data, 8);
    sort(data, 8);
    show(data, 8);
    int small[5] = {9, 2, 7};
    sort(small, 5);
    show(small, 5);
}
