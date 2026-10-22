: rem >r s>d r> sm/rem drop ;

0 value gcd_.a
0 value gcd_.b
0 value gcd_.r
: gcd_
  to gcd_.b to gcd_.a
  0 to gcd_.r
  begin gcd_.b 0 <> while
    gcd_.a gcd_.b rem to gcd_.r
    gcd_.b to gcd_.a
    gcd_.r to gcd_.b
  repeat
  gcd_.a ;

: main
  ." gcd(1071, 462) = " 1071 462 gcd_ 0 .r cr
  ." gcd(270, 192) = " 270 192 gcd_ 0 .r cr ;

main
