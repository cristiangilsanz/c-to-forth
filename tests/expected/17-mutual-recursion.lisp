(defun is_even (n)
  (when (= n 0) (return-from is_even 1))
  (is_odd (- n 1)))

(defun is_odd (n)
  (when (= n 0) (return-from is_odd 0))
  (is_even (- n 1)))

(defun main ()
  (dotimes (n 5)
    (if (/= (is_even n) 0)
        (format t "~d is even~%" n)
        (format t "~d is odd~%" n))))

(main)
