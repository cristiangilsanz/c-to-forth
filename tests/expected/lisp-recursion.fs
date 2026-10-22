: expt 1 swap 0 ?do over * loop nip ;
: gcd begin dup while tuck mod repeat drop abs ;

0 value fib.n
: fib
  fib.n >r
  to fib.n
  fib.n 2 < if
    fib.n
  else
    fib.n 1 - recurse fib.n 2 - recurse +
  then
  r> to fib.n ;

0 value hanoi.disks
: hanoi
  hanoi.disks >r
  to hanoi.disks
  hanoi.disks 0 = if
    0
  else
    1 2 hanoi.disks 1- recurse * +
  then
  r> to hanoi.disks ;

0 value power-of-two-p.n
: power-of-two-p
  to power-of-two-p.n
  power-of-two-p.n 0> power-of-two-p.n power-of-two-p.n 1- and 0= and ;

:noname
  cr 20 fib 0 .r space
  cr 10 hanoi 0 .r space
  cr 1071 462 gcd 0 .r space
  cr 2 20 expt 0 .r space
  cr 3 9 max 4 max 0 .r space
  cr 1 10 lshift 0 .r space
  cr -20 1 2 lshift / 0 .r space
  cr 64 power-of-two-p if ." T" else ." NIL" then space
  cr 65 power-of-two-p if ." T" else ." NIL" then space
  cr
  3 9 min 4 min 0 .r
  ."  "
  -7 abs 0 .r
  cr
; execute
