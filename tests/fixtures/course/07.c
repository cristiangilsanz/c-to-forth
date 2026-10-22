int a, b=5;
int c=2;
int d;
int e;

my_func() {
    int f=5;
    while (e!=f) {
        puts("The value of e is:");
        printf(e);
        e=e+1;

    }

    return e;
}

main ()
{
    puts("Hello world!");
     
    a = b;
    d = b*c/10;

    printf("%d", d);

    my_func();

    if(e==b){
        puts("Variable 'e' equals 'b'");
    }

    int g;

    g = ((5+3*5)/2+5)*-1;

    printf(g);

    if(e<g){
        puts("Variable 'e' is less than 'g'");
    } else {
        puts("Variable 'e' is greater than or equal to 'g'");
    }
    
    int i;
    puts("Counting up with i:");
    for(i=0; i <= 15; i = i+1){
        printf("%d", i, "");
    }
}

//@ (main)
