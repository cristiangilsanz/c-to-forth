0 value squares.n
0 value squares.loop-total
: squares
  to squares.n
  0 to squares.loop-total
  squares.n 1+ 1 max 1 ?do
    squares.loop-total i i * + to squares.loop-total
  loop
  squares.loop-total ;

0 value evens.n
0 value evens.loop-total
: evens
  to evens.n
  0 to evens.loop-total
  evens.n 0 max 0 ?do
    i 1 and 0= if evens.loop-total 1+ to evens.loop-total then
  loop
  evens.loop-total ;

create biggest.v 4 cells allot
0 value biggest.loop-total
0 value biggest.loop-seen
: biggest
  3 biggest.v !
  9 biggest.v 1 cells + !
  2 biggest.v 2 cells + !
  7 biggest.v 3 cells + !
  0 to biggest.loop-total
  false to biggest.loop-seen
  4 0 ?do
    biggest.loop-seen 0= biggest.v i cells + @ biggest.loop-total > or if
      biggest.v i cells + @ to biggest.loop-total
      true to biggest.loop-seen
    then
  loop
  biggest.loop-total ;

0 value first-big.n
0 value first-big.loop-total
: first-big
  to first-big.n
  0 to first-big.loop-total
  first-big.n 1+ 1 max 1 ?do
    i i * 20 > if leave then
    first-big.loop-total i + to first-big.loop-total
  loop
  first-big.loop-total ;

:noname
  5 squares 0 .r ."  " 7 evens 0 .r ."  " biggest 0 .r ."  " 100 first-big 0 .r cr
  3 0 ?do ." x" loop
  cr
  1 10 do i 0 .r ."  " -3 +loop
  cr
; execute
