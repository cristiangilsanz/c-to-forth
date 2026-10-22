0 value max3.a
0 value max3.b
0 value max3.c
: max3
  to max3.c to max3.b to max3.a
  max3.a max3.b < 0= if
    max3.a max3.c < 0= if max3.a exit then
    max3.c exit
  then
  max3.b max3.c < 0= if max3.b exit then
  max3.c ;

: main
  ." Largest of 12, 11 and 10: " 12 11 10 max3 0 .r cr
  ." Largest of 3, 9 and 4: " 3 9 4 max3 0 .r cr ;

main
