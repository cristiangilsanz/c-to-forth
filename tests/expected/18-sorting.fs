create data 42 , 7 , 19 , 3 , 88 , 21 , 5 , 64 ,

0 value swap_.a
0 value swap_.i
0 value swap_.j
0 value swap_.held
: swap_
  to swap_.j to swap_.i to swap_.a
  swap_.a swap_.i cells + @ to swap_.held
  swap_.a swap_.j cells + @ swap_.a swap_.i cells + !
  swap_.held swap_.a swap_.j cells + ! ;

0 value sort_.a
0 value sort_.n
0 value sort_.j
: sort_
  to sort_.n to sort_.a
  0 to sort_.j
  sort_.n 1 max 1 ?do
    i to sort_.j
    begin sort_.j 0 > sort_.a sort_.j 1 - cells + @ sort_.a sort_.j cells + @ > and while
      sort_.a sort_.j 1 - sort_.j swap_
      sort_.j 1- to sort_.j
    repeat
  loop ;

0 value show.a
0 value show.n
: show
  to show.n to show.a
  show.n 0 max 0 ?do
    i 0 > if ." , " then
    show.a i cells + @ 0 .r
  loop
  cr ;

create main.small 5 cells allot
: main
  main.small 5 cells erase
  data 8 show
  data 8 sort_
  data 8 show
  main.small 5 cells erase
  9 main.small 0 cells + !
  2 main.small 1 cells + !
  7 main.small 2 cells + !
  main.small 5 sort_
  main.small 5 show ;

main
