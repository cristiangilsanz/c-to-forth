: quot >r s>d r> sm/rem nip ;
: rem >r s>d r> sm/rem drop ;

0 value a
7 value b
3 value c

: main
  b c * 1 - to a
  ." b * c - 1 = " a 0 .r cr
  ." Divided by 4: " a 4 quot 0 .r cr
  ." Remainder: " a 4 rem 0 .r cr
  ." Negative division: " a negate 4 quot 0 .r cr ;

main
