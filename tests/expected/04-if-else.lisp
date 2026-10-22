(defun classify (n)
  (if (= (rem n 2) 0)
      (format t "~d is even~%" n)
      (format t "~d is odd~%" n)))

(defun main ()
  (classify 7)
  (classify 8))

(main)
