: rem >r s>d r> sm/rem drop ;

create values_ 8 cells allot
values_ 8 cells erase

: show
  8 0 ?do values_ i cells + @ 0 .r ."  " loop
  cr ;

0 value main.seed
0 value main.swapped
0 value main.held
: main
  7 to main.seed
  0 to main.swapped
  0 to main.held
  8 0 ?do
    main.seed 31 * 11 + 97 rem to main.seed
    main.seed values_ i cells + !
  loop
  show
  1 to main.swapped
  begin main.swapped 0 <> while
    0 to main.swapped
    7 0 ?do
      values_ i cells + @ values_ i 1 + cells + @ > if
        values_ i cells + @ to main.held
        values_ i 1 + cells + @ values_ i cells + !
        main.held values_ i 1 + cells + !
        1 to main.swapped
      then
    loop
  repeat
  show ;

main
