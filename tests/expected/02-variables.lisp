(setq a 0)
(setq b 7)
(setq c 3)

(defun main ()
  (setf a (- (* b c) 1))
  (format t "b * c - 1 = ~d~%" a)
  (format t "Divided by 4: ~d~%" (truncate a 4))
  (format t "Remainder: ~d~%" (rem a 4))
  (format t "Negative division: ~d~%" (truncate (- a) 4)))

(main)
