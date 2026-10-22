: rem >r s>d r> sm/rem drop ;

0 value classify.n
: classify
  to classify.n
  classify.n case
    0 of ." zero" cr endof
    1 of ." small" cr endof
    2 of ." small" cr endof
    3 of ." small" cr endof
    ." large" cr
  endcase ;

0 value first-multiple.n
0 value first-multiple.k
: first-multiple
  to first-multiple.k to first-multiple.n
  100 0 ?do
    i 0 > i first-multiple.n * first-multiple.k mod 0= and if
      i first-multiple.n * unloop exit
    then
  loop
  0 ;

0 value sign_.n
: sign_
  to sign_.n
  sign_.n 0 < if
    -1
  else
    sign_.n 0 > if
      1
    else
      0
    then
  then ;

0 value countdown.n
: countdown
  to countdown.n
  begin countdown.n 0= 0= while
    countdown.n 0 .r ."  "
    countdown.n 1- to countdown.n
  repeat
  cr ;

0 value skip-threes.next
: skip-threes
  10 0 ?do
    false to skip-threes.next
    i 3 rem 0= if true to skip-threes.next then
    skip-threes.next 0= if i 0 .r then
  loop
  cr ;

0 value top.x
:noname
  0 classify
  2 classify
  9 classify
  -5 sign_ 0 .r ."  " 0 sign_ 0 .r ."  " 8 sign_ 0 .r cr
  6 4 first-multiple 0 .r cr
  5 countdown
  skip-threes
  10 to top.x
  top.x
  top.x 1+ to top.x 0 .r ."  " top.x 0 .r cr
  1 2 > 0= if ." unless works" cr then
; execute
