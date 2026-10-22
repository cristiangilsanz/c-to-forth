0 value countdown.n
: countdown
  5 to countdown.n
  begin countdown.n 0 > while
    countdown.n 0 .r ." ... "
    countdown.n 1- to countdown.n
  repeat
  ." Lift off!" cr ;

: main
  countdown ;

main
