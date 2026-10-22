(defun describe_ (day)
  (case day
    ((0 6) (format t "weekend~%"))
    (5 (format t "almost the weekend, ") (format t "weekday~%"))
    ((1 2 3 4) (format t "weekday~%"))
    (otherwise (format t "not a day~%"))))

(defun main ()
  (loop for day from 0 to 7 do
    (format t "~d: " day)
    (describe_ day)))

(main)
