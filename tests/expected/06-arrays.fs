create squares 10 cells allot
squares 10 cells erase

: main
  10 0 ?do i i * squares i cells + ! loop
  ." Squares:"
  10 0 ?do ."  " squares i cells + @ 0 .r loop
  cr ;

main
