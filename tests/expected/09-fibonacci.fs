0 value fib.n
: fib
  fib.n >r
  to fib.n
  fib.n 2 < if fib.n r> to fib.n exit then
  fib.n 1 - recurse fib.n 2 - recurse +
  r> to fib.n ;

: main
  ." Fibonacci:"
  15 0 ?do ."  " i fib 0 .r loop
  cr ;

main
