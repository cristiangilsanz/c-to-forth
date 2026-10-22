0 value factorial.n
: factorial
  factorial.n >r
  to factorial.n
  factorial.n 1 > 0= if 1 r> to factorial.n exit then
  factorial.n factorial.n 1 - recurse *
  r> to factorial.n ;

: main
  11 1 ?do i 0 .r ." ! = " i factorial 0 .r cr loop ;

main
