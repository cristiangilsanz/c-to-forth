defer is_odd

0 value is_even.n
: is_even
  is_even.n >r
  to is_even.n
  is_even.n 0 = if 1 r> to is_even.n exit then
  is_even.n 1 - is_odd
  r> to is_even.n ;

0 value is_odd.n
:noname
  is_odd.n >r
  to is_odd.n
  is_odd.n 0 = if 0 r> to is_odd.n exit then
  is_odd.n 1 - is_even
  r> to is_odd.n ; is is_odd

: main
  5 0 ?do
    i is_even 0 <> if
      i 0 .r ."  is even" cr
    else
      i 0 .r ."  is odd" cr
    then
  loop ;

main
