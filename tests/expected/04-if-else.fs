: rem >r s>d r> sm/rem drop ;

0 value classify.n
: classify
  to classify.n
  classify.n 2 rem 0 = if
    classify.n 0 .r ."  is even" cr
  else
    classify.n 0 .r ."  is odd" cr
  then ;

: main
  7 classify
  8 classify ;

main
