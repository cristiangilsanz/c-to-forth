0 value describe_.day
: describe_
  to describe_.day
  describe_.day case
    0 of ." weekend" cr endof
    6 of ." weekend" cr endof
    5 of
      ." almost the weekend, "
      ." weekday" cr
    endof
    1 of ." weekday" cr endof
    2 of ." weekday" cr endof
    3 of ." weekday" cr endof
    4 of ." weekday" cr endof
    ." not a day" cr
  endcase ;

: main
  8 0 ?do
    i 0 .r ." : "
    i describe_
  loop ;

main
